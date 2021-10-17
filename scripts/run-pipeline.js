const sh = require('shelljs')
const path = require('path')

sh.cd('workdir')
echoHeadline('pipeline starting')

const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME
if (!UPLOAD_BUCKET_NAME) {
  console.log('ERROR. Env variable UPLOAD_BUCKET_NAME not found')
  return
}

// install atorger's code
sh.exec('git clone --depth 1 https://github.com/atorger/nvdb2osm.git')
sh.exec('pip install -r nvdb2osm/requirements.txt')

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
  sh.exec(
    `python split_nvdb_data.py --lanskod_filter ${lanskod} "${nvdbFile}" output/ 2>&1`
  ).to(`output/split_${lanskod}.log`)

  // now run the conversion for every splitted file
  const kommunFiles = Array.from(sh.ls('output/*.zip'))
  for (const kommunFile of kommunFiles) {
    const kommunName = path.parse(kommunFile)?.name
    echoHeadline('processing ' + kommunFile)

    let splitCmdParams = ''
    if (sh.test('-f', `data/${kommunName}-split.geojson`)) {
      splitCmdParams = `--split_file="data/${kommunName}-split.geojson" --split_dir="output/${kommunName}-split"`
      sh.mkdir(`output/${kommunName}-split`)
    }

    sh.exec(
      `python nvdb2osm.py "${kommunFile}" "output/${kommunName}.osm" --skip_self_test --railway_file=../download/rail.zip ${splitCmdParams} 2>&1`
    ).to(`output/${kommunName}.log`)

    if (splitCmdParams !== '') {
      sh.exec(
        `zip -rmj "output/${kommunName}-split.zip" "output/${kommunName}-split/"`
      )
    }
  }

  // Upload files to S3
  sh.exec(
    `aws s3 cp output/ s3://${UPLOAD_BUCKET_NAME}/osm/ --recursive --exclude="*" --include="*.log" --include="*.osm" --include="*-split.zip" --acl public-read`
  )
}

function echoHeadline(str) {
  console.log('')
  console.log('')
  console.log('*'.repeat(str.length + 4))
  console.log('  ' + str + '  ')
  console.log('*'.repeat(str.length + 4))
  console.log('')
}
