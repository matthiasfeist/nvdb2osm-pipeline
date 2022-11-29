'use strict'
const fetch = require('node-fetch')
const fs = require('fs')
const stream = require('stream')
const util = require('util')
const lanskodList = require('./lanskod.json')
const path = require('path')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

async function downloadFiles(downloadFolder, lanskod, username, password) {
  const bearerToken = await getLoginToken(username, password)
  if (!bearerToken) {
    console.log('Login was not successful. No Bearer token returned')
    return
  }

  let lastkajenFolderArray = await getFolderIDsFromLastkajen(bearerToken)

  if (lanskod !== 'all') {
    const onlyDownload = lanskod.split(',')
    lastkajenFolderArray = lastkajenFolderArray.filter(
      (v) =>
        onlyDownload.includes(v.targetFilename) || v.targetFilename === 'rail'
    )
  }

  console.log('Found folders:')
  console.log(lastkajenFolderArray)

  for (const lastkajenFolder of lastkajenFolderArray) {
    try {
      await downloadNVDBFile(
        lastkajenFolder.folderId,
        lastkajenFolder.targetFilename,
        downloadFolder,
        bearerToken
      )
    } catch (error) {
      console.log(error)
    }
  }
}

async function getLoginToken(username, password) {
  try {
    const response = await fetch(
      'https://lastkajen.trafikverket.se/api/Identity/Login',
      {
        method: 'post',
        body: JSON.stringify({
          UserName: username,
          Password: password,
        }),
        headers: { 'Content-Type': 'application/json' },
      }
    )
    if (!response.ok) {
      throw new Error(
        'Trafikverket Lastkajen Login responed with ' + response.status
      )
    }
    const responseData = await response.json()
    return responseData.access_token
  } catch (err) {
    console.log(err)
    return null
  }
}

async function getFolderIDsFromLastkajen(bearerToken) {
  const response = await fetch(
    'https://lastkajen.trafikverket.se/api/DataPackage/GetPublishedDataPackages',
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    }
  )
  if (!response.ok) {
    throw new Error(
      'Trafikverket Lastkajen DataPackage/GetDataPackages responed with' +
        response.status
    )
  }
  const responseData = await response.json()
  const result = []

  // find file "Järnvägsnät med grundegenskaper"
  responseData.forEach((responseEntry) => {
    if (
      !responseEntry.sourceFolder?.includes('Järnvägsnät med grundegenskaper')
    ) {
      return
    }
    result.push({
      targetFilename: 'rail',
      folderId: responseEntry.id,
    })
  })

  // find the "Länsfiler"
  responseData.forEach((responseEntry) => {
    if (!responseEntry.sourceFolder?.includes('Länsfiler NVDB-data')) {
      return
    }
    lanskodList.forEach((lanskodListItem) => {
      if (
        lanskodListItem.name?.toLocaleLowerCase() ===
        responseEntry.name?.toLocaleLowerCase()
      ) {
        result.push({
          targetFilename: lanskodListItem.lanskod,
          folderId: responseEntry.id,
        })
      }
    })
  })

  // return result.sort((a, b) =>
  //   a.targetFilename.localeCompare(b.targetFilename, 'en-u-kn-true')
  // )

  // shuffle the array and don't sort it. that way if we get blocked or a
  // timeout from Lastkajen at least we don't always download the same ones first.
  return result.sort(() => Math.random() - 0.5)
}

async function downloadNVDBFile(
  folderId,
  targetFilename,
  downloadFolder,
  bearerToken
) {
  const fullFilename = path.join(downloadFolder, targetFilename + '.zip')
  console.groupEnd()
  console.group(
    'starting download.',
    'folderID',
    folderId,
    ' => ',
    fullFilename
  )

  const folderDetailsResponse = await fetch(
    `https://lastkajen.trafikverket.se/api/DataPackage/GetDataPackageFiles/${folderId}`,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    }
  )
  if (!folderDetailsResponse.ok) {
    throw new Error(
      `Trafikverket Lastkajen DataPackage/GetDataPackageFiles/${folderId} responed with ` +
        folderDetailsResponse.status
    )
  }
  const folderDetailsJson = await folderDetailsResponse.json()

  // find the link to request the download token:
  let filename = null
  let sizeFromApi = ''
  folderDetailsJson.forEach((fileDetails) => {
    if (
      fileDetails.name?.includes('GeoPackage.zip') ||
      fileDetails.name?.includes(
        'Järnvägsnät_grundegenskaper2_0_GeoPackage.zip'
      )
    ) {
      filename = fileDetails.name
      sizeFromApi = fileDetails.size
    }
  })
  if (!filename) {
    throw new Error(
      `can't find filename for ${targetFilename}. FolderId: ${folderId}`
    )
  }
  console.log(
    'folder details recieved and file name found:',
    filename,
    'size:',
    sizeFromApi
  )

  // retrieve the download token for this file:
  const downloadTokenResponse = await fetch(
    `https://lastkajen.trafikverket.se/services/api/file/GetDataPackageDownloadToken?id=${folderId}&fileName=${encodeURIComponent(
      filename
    )}`
  )
  if (!downloadTokenResponse.ok) {
    throw new Error(
      `Trafikverket Lastkajen GetDataPackageDownloadToken ${folderId} ${filename} responed with`,
      trafVerkResponse.status
    )
  }
  const downloadToken = await downloadTokenResponse.json()
  if (!downloadToken) {
    throw new Error('No Download Token given')
  }
  console.log('download token recieved:', downloadToken)

  // download the file
  console.log('starting download...')
  console.time('download finished')
  const streamPipeline = util.promisify(stream.pipeline)
  const downloadResponse = await fetch(
    `https://lastkajen.trafikverket.se/api/File/GetDataPackageFile?token=${downloadToken}`
  )
  if (!downloadResponse.ok) {
    throw new Error(`unexpected response ${response.statusText}`)
  }
  await streamPipeline(
    downloadResponse.body,
    fs.createWriteStream(fullFilename)
  )
  console.timeEnd('download finished')
  console.groupEnd()
}

const argv = yargs(hideBin(process.argv))
  .option('username', {
    alias: 'user',
    demandOption: true,
    normalize: true,
    type: 'string',
    description: 'username for Lastkajen',
  })
  .option('password', {
    alias: 'pass',
    demandOption: true,
    normalize: true,
    type: 'string',
    description: 'password for Lastkajen',
  })
  .option('downloadpath', {
    alias: 'p',
    demandOption: true,
    normalize: true,
    type: 'string',
    description: 'Path to download the files into',
  })
  .option('lanskod', {
    alias: 'l',
    demandOption: true,
    type: 'string',
    description:
      'länskod to download (use comma to download multiple, use "all" to download all)',
  }).argv

console.log(new Date().toString())
downloadFiles(argv.downloadpath, argv.lanskod, argv.username, argv.password)
