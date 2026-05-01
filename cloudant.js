const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');

const cloudant = CloudantV1.newInstance({
  authenticator: new IamAuthenticator({
    apikey: "darIH5ZB-QFMIIaufbQZhQG0LFeH-Gl67_TQQlGUqIY1"
  })
});

cloudant.setServiceUrl("https://apikey-v2-2r0xuqymf3hnmcoh2boiax0gwsewl63t83flnkdivgx4:f154c0783d9dbec5a8fb31e81a1ff65c@3aaf7a97-96fb-434c-9588-cf735f03897f-bluemix.cloudantnosqldb.appdomain.cloud");

module.exports = cloudant;