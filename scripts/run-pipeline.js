const sh = require('shelljs')
const path = require('path')

sh.cd('workdir')
echoHeadline('pipeline starting')

const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME
if (!UPLOAD_BUCKET_NAME) {
  console.log('ERROR. Env variable UPLOAD_BUCKET_NAME not found')
  process.exit(1)
}

// run the splitting of the "länsfiler"
sh.cd('nvdb2osm')

const downloadedFiles = Array.from(sh.ls('../download/*.zip'))
for (const nvdbFile of downloadedFiles) {
  if (nvdbFile.includes('rail')) {
    // make sure we're not processing the railway file
    continue
  }

  echoHeadline('processing ' + nvdbFile)
  const lanskod = path.parse(nvdbFile)?.name

  sh.rm('-r', 'output/')
  sh.mkdir('output')
  const splitCommand = `python split_nvdb_data.py --lanskod_filter ${lanskod} "${nvdbFile}" output/ &> output/split_${lanskod}.log`
  console.log('Running Split command: ' + splitCommand)
  sh.exec(splitCommand)

  // Upload generated shape files to S3
  console.log('Uploading files to S3')
  sh.exec(
    `aws s3 cp output/ s3://${UPLOAD_BUCKET_NAME}/split/ --no-progress --recursive --exclude="*" --include="*.zip" --acl public-read`
  )
  // Upload split logs to S3
  sh.exec(
    `aws s3 cp output/ s3://${UPLOAD_BUCKET_NAME}/split/ --no-progress --recursive --exclude="*" --include="*.log" --acl public-read --content-type 'text/plain; charset="UTF-8"'`
  )

  // now run the conversion for every splitted file
  const kommunFiles = Array.from(sh.ls('output/*.zip'))
  for (const kommunFile of kommunFiles) {
    const kommunName = path.parse(kommunFile)?.name
    echoHeadline('processing ' + kommunFile)

    let splitCmdParams = ''
    if (sh.test('-f', `data/${kommunName}-split.geojson`)) {
      splitCmdParams = `--split_file="data/${kommunName}-split.geojson" --split_dir="output/${kommunName}-split"`
      sh.mkdir(`output/${kommunName}-split`)
    } else {
      console.log('No split file found. ', `data/${kommunName}-split.geojson`)
    }

    let railFileCmdParams = '--skip_railway'
    if (sh.test('-f', '../download/rail.zip')) {
      railFileCmdParams = '--railway_file=../download/rail.zip'
    } else {
      console.log('Railway file not found. Skipping.')
    }

    const nvdb2osmCmd = `python nvdb2osm.py "${kommunFile}" "output/${kommunName}.osm" --municipality_filter="${kommunName}" ${railFileCmdParams} ${splitCmdParams} &> output/${kommunName}.log`
    console.log('Running nvdb2osm script: ', nvdb2osmCmd)
    sh.exec(nvdb2osmCmd)

    if (splitCmdParams !== '') {
      const zipCmd = `zip -rmj "output/${kommunName}-split.zip" "output/${kommunName}-split/"`
      console.log('Running zip : ', zipCmd)
      sh.exec(zipCmd)
    }
  }

  // Upload files to S3
  console.log('Uploading files to S3')
  sh.exec(
    `aws s3 cp output/ s3://${UPLOAD_BUCKET_NAME}/osm/ --no-progress --recursive --exclude="*" --include="*.osm" --include="*-split.zip" --acl public-read`
  )
  // upload log files
  sh.exec(
    `aws s3 cp output/ s3://${UPLOAD_BUCKET_NAME}/osm/ --no-progress --recursive --exclude="*" --include="*.log" --acl public-read --content-type 'text/plain; charset="UTF-8"'`
  )
}

function echoHeadline(str) {
  console.log('')
  console.log('')
  console.log('*'.repeat(str.length + 4))
  console.log('  ' + new Date().toString())
  console.log('  ' + str + '  ')
  console.log('*'.repeat(str.length + 4))
  console.log('')
}
