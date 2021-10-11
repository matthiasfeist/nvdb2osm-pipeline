# NVDB OSM diff map

This project utilizes the data provided by [Sweden's National Road Database](https://www.nvdb.se/sv/about-nvdb/) together with the Open Source project [Nvdb2osm](https://github.com/atorger/nvdb2osm/) to provide assistance to OSM contributors in Sweden.
This contribution is in the form of OSM files that represent the status of the National Road Database (as produced by nvdb2osm) without the need to run the script locally

## How to deploy the pipeline yourself?

### set up the AWS account and Github permissions

1. in your AWS account go to EC2 and open _"Key Pairs"_ in the navigation
2. Generate a new keypair with the name `nvdb2osm-ec2`. Use RSA as the key pair type and ".pem" as the format. A new keypair is now created and downloaded.
3. on your computer, set the permissions for the downloaded key file: `chmod 400 nvdb2osm-ec2.pem`

### deploy this project to AWS and run it

1. Clone the repo. You'll need at least Node 14
2. run `npm i`
3. run `npx serverless deploy`. This will deploy one lambda function which is responsible for periodically launching a EC2 instance which runs the code.
