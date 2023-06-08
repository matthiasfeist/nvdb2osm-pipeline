const AWS = require('@aws-sdk/client-s3')
const s3 = new AWS.S3()
const path = require('path')
const fs = require('fs')
const Mustache = require('mustache')
const dateFns = require('date-fns')
const fetch = require('node-fetch')

exports.handler = async function (event, context) {
  const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME

  let data = await getData(UPLOAD_BUCKET_NAME)
  data = await getStatusFromOSMWikiPage(data)

  const stats = calculateStats(data)

  const template = fs.readFileSync(path.join(__dirname, 'index.mustache'), {
    encoding: 'utf-8',
  })
  const output = Mustache.render(template, { data, stats })
  await s3.putObject({
    Bucket: UPLOAD_BUCKET_NAME,
    Key: 'index.html',
    Body: output,
    ACL: 'public-read',
    ContentType: 'text/html',
    CacheControl: 'No-Cache',
  })
}

async function getData(UPLOAD_BUCKET_NAME) {
  const osmAndLogsListingResponse = await s3.listObjectsV2({
    Bucket: UPLOAD_BUCKET_NAME,
    Prefix: 'osm/',
  })

  const kommunFiles = {}
  osmAndLogsListingResponse.Contents?.forEach((s3File) => {
    const pathParts = path.parse(s3File.Key)
    let name = pathParts.name
    let ext = pathParts.ext?.substr(1)

    if (name.startsWith('split_')) {
      return
    }
    if (ext === 'zip' && name.endsWith('-split')) {
      name = name.slice(0, -6) // remove the "-split" part
      ext = 'split'
    }

    // initialize the object
    const kommunFile = kommunFiles[name] ? kommunFiles[name] : {}

    kommunFile[ext] = {
      generatedDaysAgo: dateFns.formatDistanceToNowStrict(
        new Date(s3File.LastModified),
        { addSuffix: true }
      ),
      downloadLink: `https://${UPLOAD_BUCKET_NAME}.s3.amazonaws.com/${s3File.Key}`,
      sizeMb: Math.ceil(s3File.Size / 1024 / 1024),
    }

    kommunFiles[name] = kommunFile
  })

  // now convert it to an array:
  const result = []
  Object.keys(kommunFiles).forEach((name) => {
    result.push({
      name,
      ...kommunFiles[name],
    })
  })
  return result
}

async function getStatusFromOSMWikiPage(data) {
  const apiUrl =
    'https://wiki.openstreetmap.org/w/api.php?action=parse&prop=wikitext&page=Import/Catalogue/Sweden%20highway%20import/Progress&formatversion=2&format=json'
  const response = await fetch(apiUrl)
  if (!response.ok) {
    return data
  }
  const responseData = await response.json()
  const [ongoingWork, finishedWork] = responseData.parse?.wikitext?.split(
    '== Färdigställda kommuner =='
  )

  if (!ongoingWork || !finishedWork) {
    return data
  }

  for (let index = 0; index < data.length; index++) {
    data[index].importStatus = null
    const kommunName = data[index].name
    if (ongoingWork.includes(kommunName)) {
      data[index].importStatus = 'ongoing import'
    } else if (finishedWork.includes(kommunName)) {
      data[index].importStatus = 'import finished'
    }
  }

  return data
}

function calculateStats(data) {
  const osmItems = data.filter((item) => !!item.osm)
  const ongoingItems = osmItems.filter(
    (item) => item.importStatus === 'ongoing import'
  )
  const finishedItems = osmItems.filter(
    (item) => item.importStatus === 'import finished'
  )

  const sizeReducer = (prev, item) => {
    return prev + item.osm.sizeMb
  }

  const totalSize = osmItems.reduce(sizeReducer, 0)
  const ongoingSize = ongoingItems.reduce(sizeReducer, 0)
  const finishedSize = finishedItems.reduce(sizeReducer, 0)

  const ongoingPercentage = Math.round(
    (ongoingItems.length / osmItems.length) * 100
  )
  const finishedPercentage = Math.round(
    (finishedItems.length / osmItems.length) * 100
  )

  const ongoingSizePercentage = Math.round((ongoingSize / totalSize) * 100)
  const finishedSizePercentage = Math.round((finishedSize / totalSize) * 100)

  return {
    numOsmItems: osmItems.length,
    numErrorItems: data.length - osmItems.length,
    numOngoing: ongoingItems.length,
    numFinished: finishedItems.length,

    totalSize: totalSize,
    ongoingSize: ongoingSize,
    finishedSize: finishedSize,

    ongoingPercentage: ongoingPercentage,
    finishedPercentage: finishedPercentage,

    ongoingSizePercentage: ongoingSizePercentage,
    finishedSizePercentage: finishedSizePercentage,
  }
}
