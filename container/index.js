const { S3Client , GetObjectCommand,PutObjectCommand } = require("@aws-sdk/client-s3");
const ffmpeg = require('fluent-ffmpeg');
const fs = require("node:fs/promises");
const fsold = require("node:fs");
const path = require("node:path");
require('dotenv').config();
const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;


if (!accessKeyId || !secretAccessKey) {
  throw new Error("AWS credentials are not set in environment variables.");
}

const resolutions = [
  { name: '1080p', width: 1920, height: 1080 },
  { name: '720p', width: 1280, height: 720 },
  { name: '480p', width: 854, height: 480 },
  { name: '360p', width: 640, height: 360 },
 
];
const client = new S3Client({ 
    
     region: "ap-south-1",
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    // NkkLRxg1y9Ap54tDzjjUG6ZSuVGftRkxwH4v2U3d
  },
});
const Bucket=process.env.Bucket;
const Key=process.env.Key;
async function init(){
    const command = new GetObjectCommand({
        Bucket: Bucket,
        Key: Key,
      });
     const result = await client.send(command);
    //Dwonload the file to first 
    const filepath="original-video.mp4";
    await fs.writeFile(filepath, result.Body);
    const originalVideoPath = path.resolve(filepath);


    //start the transcoder
    const promise = resolutions.map((resolution) => {
        const output = `video-${resolution.name}.mp4`;
        return new Promise((resolve) => {
           ffmpeg(originalVideoPath)
            .output(output)
            .withVideoCodec("libx264")
            .withAudioCodec("aac")
            .withSize(`${resolution.width}x${resolution.height}`)
            .on('end', async () => {
                const putcommand = new PutObjectCommand({
                    Bucket:"transcoded-video.himanshu.dev",
                    Key: output,
                    Body: fsold.createReadStream(path.resolve(output)),
                });
                await client.send(putcommand);
                console.log(`Transcoded video to ${resolution.name} and uploaded to S3`);
                resolve();
                
            })
            .format('mp4')
            .run();
     
        });
      });
      await Promise.all(promise);

}
init();