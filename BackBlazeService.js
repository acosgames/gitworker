
const credutil = require('shared/util/credentials')
const { utcDATETIME } = require('shared/util/datefns');

// const UploadFile = require('./uploadfile');
// const upload = new UploadFile();


const AWS = require('aws-sdk');
const fs = require('fs');
const zlib = require("zlib");
const { rejects } = require('assert');

const { Readable } = require('stream');


module.exports = class BackBlazeService {

    constructor(credentials) {
        this.credentials = credentials || credutil();

        this.s3cred = new AWS.SharedIniFileCredentials({ profile: 'b2' });
        //AWS.config.credentials = credentials;
        //var ep = new AWS.Endpoint('s3.us-west-002.backblazeb2.com');
        this.s3 = new AWS.S3(this.credentials.backblaze);
    }

    connect() {

    }

    s3() {
        return this.s3;
    }

    upload(key, data) {

    }

    async multiPartUpload(Bucket, Key, buffer, options) {

        const $this = this;
        return new Promise(async (rs, rj) => {


            let defaultOptions = {
                Bucket, Key
            }

            options = options || {};

            if (options)
                options = Object.assign({}, defaultOptions, options);

            options.ContentType = options.ContentType || 'application/json';
            options.ACL = options.ACL || 'public-read';
            options.StorageClass = options.StorageClass || 'STANDARD';
            options.ContentEncoding = options.ContentEncoding || 'gzip';

            if (options.ContentEncoding == 'gzip')
                options.Metadata = {
                    'Content-Type': 'application/json',
                    'Content-Encoding': 'gzip',
                    'b2-content-encoding': 'gzip'
                }

            try {
                let multipartCreateResult = await $this.s3.createMultipartUpload(options).promise()

                let chunks = [];
                let chunkCount = 1;
                let uploadPartResults = [];
                const stream = Readable.from(buffer);

                stream.on('readable', async () => {
                    let chunk;
                    // console.log('Stream is now readable');
                    while (null !== (chunk = stream.read(5242880))) {
                        // console.log(`Chunk read: ${chunk}`)
                        chunks.push(chunk)
                    }
                    // console.log(`Null returned`)
                })

                stream.on('end', async () => {

                    try {
                        for (let i = 0; i < chunks.length; i++) {
                            let uploadPromiseResult = await $this.s3.uploadPart({
                                Body: chunks[i],
                                Bucket,
                                Key,
                                PartNumber: i + 1,
                                UploadId: multipartCreateResult.UploadId,
                            }).promise()

                            uploadPartResults.push({
                                PartNumber: i + 1,
                                ETag: uploadPromiseResult.ETag
                            })
                        }


                        let completeUploadResponce = await $this.s3.completeMultipartUpload({
                            Bucket,
                            Key,
                            MultipartUpload: {
                                Parts: uploadPartResults
                            },
                            UploadId: multipartCreateResult.UploadId
                        }).promise()

                        rs(completeUploadResponce);
                    }
                    catch (e2) {
                        rj(e2);
                    }



                })
            }
            catch (e) {
                rj(e);
            }


        })

    }

    downloadClientFile(Key) {
        return new Promise((rs, rj) => {
            try {
                var params = {
                    Key,
                    Bucket: 'acospub'
                }

                this.s3.getObject(params, function (err, data) {
                    if (err) {
                        rj(err);
                        return;
                    }
                    rs(data);
                    console.log('file downloaded successfully: ', Key)
                })
            }
            catch (e) {
                console.error(e);
            }
        });
    }

    downloadServerDatabase(Key) {
        const $this = this;
        return new Promise(async (rs, rj) => {
            try {
                var params = {
                    Key,
                    Bucket: 'acospriv'
                }

                let rootPath = './serverScripts';
                let folderPath = '/' + Key.split('/')[0];
                let localPath = rootPath + '/' + Key;
                if (fs.existsSync(localPath)) {
                    let data = await fs.promises.readFile(localPath);
                    let js = $this.unzipServerFile(data);
                    rs(js);
                    console.log('file loaded from filesystem successfully')
                    return;
                }
                this.s3.getObject(params, async function (err, data) {
                    if (err) {
                        rj(err);
                        return;
                    }

                    await fs.promises.mkdir(rootPath + folderPath, { recursive: true });
                    await fs.promises.writeFile('./serverScripts/' + Key, data.Body)

                    let js = await $this.unzipServerFile(data.Body);
                    console.log('file downloaded successfully: ', Key)

                    rs(js);

                })
            }
            catch (e) {
                console.error(e);
                rj(e);
            }
        });
    }

    async unzipServerFile(body) {
        return new Promise(async (rs, rj) => {
            try {
                zlib.gunzip(body, (err, buffer) => {
                    if (err) {
                        console.error(err);
                        rj(err);
                        return;
                    }
                    let js = buffer.toString('utf8');
                    rs(js);
                });
            }
            catch (e) {
                console.error(e);
                rj(e);
            }
        })

    }

    downloadServerScript(Key, meta) {
        const $this = this;
        return new Promise(async (rs, rj) => {
            try {
                var params = {
                    Key,
                    Bucket: 'acospriv'
                }

                let rootPath = './serverScripts';
                let folderPath = '/' + Key.split('/')[0];
                let localPath = rootPath + '/' + Key;
                let fileExists = false;
                try {
                    fileExists = await fs.promises.access(localPath);
                } catch (e) {
                    console.error(e);
                }
                if (fileExists) {
                    let data = await fs.promises.readFile(localPath);
                    let js = await $this.unzipServerFile(data);
                    rs(js);
                    console.log('file loaded from filesystem successfully')
                    return;
                }
                this.s3.getObject(params, async function (err, data) {
                    if (err) {
                        rj(err);
                        return;
                    }

                    await fs.promises.mkdir(rootPath + folderPath, { recursive: true });
                    await fs.promises.writeFile('./serverScripts/' + Key, data.Body)

                    let js = await $this.unzipServerFile(data.Body);
                    console.log('file downloaded successfully: ', Key)

                    rs(js);

                })
            }
            catch (e) {
                console.error(e);
                rj(e);
            }
        });
    }

}