const sh = require('shelljs')
const path = require('path')

sh.cd('workdir')
const WORKDIR = String(sh.pwd())
echoHeadline('pipeline starting')

// install atorger's code
sh.exec('git clone --depth 1 https://github.com/atorger/nvdb2osm.git')
sh.exec('pip install -r nvdb2osm/requirements.txt')

// clone the data repo
sh.exec(
  'git clone --depth 1 git@github.com:matthiasfeist/nvdb2osm-pipeline-data.git'
)

// run the splitting of the "länsfiler"
sh.cd('nvdb2osm')

const downloadedFiles = Array.from(sh.ls('../download/*.zip'))
for (const nvdbFile of downloadedFiles) {
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

    sh.exec(
      `python nvdb2osm.py "${kommunFile}" "output/${kommunName}.osm" --skip_railway --skip_self_test 2>&1`
    ).to(`output/split_${kommunName}.log`)
  }
  break
}

// 'mkdir data',
// `aws s3 sync s3://${BUCKET_NAME}/nvdb-zip/ ./data/`,
// 'for f in ./data/*.zip',
// 'do',
// '  echo ${f%.zip}',
// '  osmfile=${f%.zip}.osm',
// '  logfile=${f%.zip}.log',
// '  python nvdb2osm.py $f $osmfile -v --skip_railway 2>&1 | tee $logfile',
// `  aws s3 cp $logfile s3://${BUCKET_NAME}/${OSM_FOLDER}/ --acl public-read`,
// `  aws s3 cp $osmfile s3://${BUCKET_NAME}/${OSM_FOLDER}/ --acl public-read`,
// '  rm $f',
// 'done',
// // s3 sync in the end because it sometimes happens that files are not uploaded
// `aws s3 sync ./data/ s3://${BUCKET_NAME}/${OSM_FOLDER}/ --exclude="*" --include="*.log" --include="*.osm" --acl public-read`,

function echoHeadline(str) {
  console.log('')
  console.log('*'.repeat(str.length))
  console.log(str)
  console.log('*'.repeat(str.length))
  console.log('')
}
