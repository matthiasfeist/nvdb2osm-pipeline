const fetch = require('node-fetch')
const fs = require('fs')
const stream = require('stream')
const util = require('util')
const lanskodList = require('./lanskod.json')
const path = require('path')

async function downloadFiles(downloadFolder) {
  const lastkajenFolderArray = await getFolderIDsFromLastkajen()
  for (const lastkajenFolder of lastkajenFolderArray) {
    await downloadNVDBFile(
      lastkajenFolder.folderId,
      lastkajenFolder.targetFilename,
      downloadFolder
    )
  }
}

async function getFolderIDsFromLastkajen() {
  const response = await fetch(
    'https://lastkajen.trafikverket.se/api/DataPackage/GetDataPackages'
  )
  if (!response.ok) {
    throw new Error(
      'Trafikverket Lastkajen DataPackage/GetDataPackages responed with',
      trafVerkResponse.status
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

  return result.sort((a, b) =>
    a.targetFilename.localeCompare(b.targetFilename, 'en-u-kn-true')
  )
}

async function downloadNVDBFile(folderId, targetFilename, downloadFolder) {
  const folderDetailsResponse = await fetch(
    `https://lastkajen.trafikverket.se/api/DataPackage/GetDataPackageFiles/${folderId}`
  )
  if (!folderDetailsResponse.ok) {
    throw new Error(
      `Trafikverket Lastkajen DataPackage/GetDataPackageFiles/${folderId} responed with`,
      trafVerkResponse.status
    )
  }
  const folderDetailsJson = await folderDetailsResponse.json()

  // find the link to request the download token:
  let filename = null
  folderDetailsJson.forEach((fileDetails) => {
    if (
      fileDetails.name?.includes('Shape.zip') ||
      fileDetails.name?.includes('Järnvägsnät_grundegenskaper.zip')
    ) {
      filename = fileDetails.name
    }
  })
  if (!filename) {
    throw new Error(
      `can't find filename for ${targetFilename}. FolderId: ${folderId}`
    )
  }

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

  // download the file
  const fullFilename = path.join(downloadFolder, targetFilename + '.zip')
  console.log('downloading', filename, ' => ', fullFilename)

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
}

const downloadFolder = path.normalize(process.argv[2])
if (!downloadFolder) {
  throw new Error('No download folder param found')
}
console.log(new Date().toString())
downloadFiles(downloadFolder)
console.log('download done')
