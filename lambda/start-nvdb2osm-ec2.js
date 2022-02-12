const AWS = require('aws-sdk')
const ec2 = new AWS.EC2()

exports.handler = async function (event, context) {
  const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME
  const userData = [
    '#!/bin/bash',
    'shutdown -h +1440', // 1 day. just to make sure we're not running an expensive server forever in case something goes wrong

    // make everything work with Swedish characters in the filename
    'export LANG=en_US.utf-8',
    'export LC_ALL=en_US.utf-8',

    // update packages and install git
    'yum update -y',
    'yum install git -y',

    // install node:
    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash',
    'export NVM_DIR="$HOME/.nvm"',
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    'nvm install node',

    // install python and avtivate
    'yum install python3 -y',
    'python3 -m venv python-env',
    'source ./python-env/bin/activate',
    'pip install pip --upgrade',

    // clone the project
    'git clone --depth 1 https://github.com/matthiasfeist/nvdb2osm-pipeline.git',
    'cd nvdb2osm-pipeline/',
    'npm i -production',

    // run the pipeline
    'mkdir -p workdir/download',
    'export UPLOAD_BUCKET_NAME=' + UPLOAD_BUCKET_NAME,

    'node scripts/download-nvdb.js ./workdir/download | tee download.log',
    `aws s3 cp download.log s3://${UPLOAD_BUCKET_NAME}/logs/ --no-progress --acl public-read --content-type text/plain`,

    'node scripts/run-pipeline.js | tee pipeline.log',
    `aws s3 cp pipeline.log s3://${UPLOAD_BUCKET_NAME}/logs/ --no-progress --acl public-read --content-type text/plain`,

    // done
    'shutdown -h',
  ]

  const params = {
    ImageId: 'ami-02a6bfdcf8224bd77', // Amazon Linux 2 AMI
    InstanceType: 'c5.xlarge', // to get at least 8GB of RAM, otherwise we can't process the large stockholm file
    KeyName: 'nvdb2osm-ec2',
    MaxCount: 1,
    MinCount: 1,
    InstanceInitiatedShutdownBehavior: 'terminate',
    IamInstanceProfile: {
      Arn: process.env.INSTANCE_PROFILE_ARN,
    },
    Monitoring: { Enabled: true },
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
    BlockDeviceMappings: [
      {
        DeviceName: '/dev/xvda',
        Ebs: {
          DeleteOnTermination: true,
          VolumeSize: 20,
          VolumeType: 'gp2',
        },
      },
    ],
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [{ Key: 'Name', Value: 'nvdb2osm-pipeline-run' }],
      },
    ],
  }
  const result = await ec2.runInstances(params).promise()
  console.log(result)
}
