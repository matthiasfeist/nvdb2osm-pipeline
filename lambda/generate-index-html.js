const AWS = require('aws-sdk')
const s3 = new AWS.S3()
const path = require('path')
const fs = require('fs')
const Mustache = require('mustache')
const dateFns = require('date-fns')

exports.handler = async function (event, context) {
  const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME

  const data = await getData(UPLOAD_BUCKET_NAME)
  const template = fs.readFileSync(path.join(__dirname, 'index.mustache'), {
    encoding: 'utf-8',
  })
  const output = Mustache.render(template, { data })
  await s3
    .putObject({
      Bucket: UPLOAD_BUCKET_NAME,
      Key: 'index.html',
      Body: output,
      ACL: 'public-read',
      ContentType: 'text/html',
      CacheControl: 'No-Cache',
    })
    .promise()
}

async function getData(UPLOAD_BUCKET_NAME) {
  const osmAndLogsListingResponse = await s3
    .listObjectsV2({ Bucket: UPLOAD_BUCKET_NAME, Prefix: 'osm/' })
    .promise()

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

/*
exports.handler = async function (event, context) {
  const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME

  const osmAndLogsListingResponse = await s3
    .listObjectsV2({ Bucket: UPLOAD_BUCKET_NAME, Prefix: 'osm/' })
    .promise()
  const osmAndLogsListing = osmAndLogsListingResponse.Contents

  const resultList = trafikverketData.map((kommunData) => {
    const sourceDownloadedDate = getZipDownloadedDate(
      kommunData.slug,
      nvdbZipListing
    )
    return {
      id: kommunData.slug,
      displayName: kommunData.name,
      sourceData: sourceDownloadedDate
        ? {
            source: 'Trafikverket Lastkajen',
            downloadedDate: sourceDownloadedDate,
          }
        : null,
      generatedData: {
        log: getGeneratedData(
          kommunData.slug,
          'log',
          osmAndLogsListing,
          UPLOAD_BUCKET_NAME
        ),
        osm: getGeneratedData(
          kommunData.slug,
          'osm',
          osmAndLogsListing,
          UPLOAD_BUCKET_NAME
        ),
      },
    }
  })

  const result = {
    meta: { generatedDate: new Date().toISOString() },
    data: resultList,
  }

  await s3
    .putObject({
      Bucket: UPLOAD_BUCKET_NAME,
      Key: 'data-index.json',
      Body: JSON.stringify(result),
      ACL: 'public-read',
      ContentType: 'application/json',
    })
    .promise()
}

function getZipDownloadedDate(slug, nvdbZipListing) {
  const listingItem = nvdbZipListing.find(
    (item) => item.Key === 'nvdb-zip/' + slug + '.zip'
  )
  if (!listingItem) {
    return null
  }
  return new Date(listingItem.LastModified).toISOString()
}

function getGeneratedData(slug, ext, osmAndLogsListing, bucketname) {
  const item = osmAndLogsListing.find(
    (item) => item.Key === 'osm/' + slug + '.' + ext
  )
  if (!item) {
    return null
  }

  return {
    generatedDate: new Date(item.LastModified).toISOString(),
    downloadLink: `https://${bucketname}.s3.amazonaws.com/osm/${slug}.${ext}`,
    size_bytes: item.Size,
  }
}
*/
