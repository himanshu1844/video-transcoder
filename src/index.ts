import { SQSClient, ReceiveMessageCommand,DeleteMessageCommand} from "@aws-sdk/client-sqs";
import { S3Event } from "aws-lambda";
import { ECSClient, RunTaskCommand} from "@aws-sdk/client-ecs";
require('dotenv').config();
const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;


if (!accessKeyId || !secretAccessKey) {
  throw new Error("AWS credentials are not set in environment variables.");
}

const client = new SQSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  },
});
const ECSclient = new ECSClient(
  {
  region: "ap-south-1",
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
   
  },
}

);
async function init (){
    const command = new ReceiveMessageCommand({
    QueueUrl: "https://sqs.ap-south-1.amazonaws.com/021391128440/temp-video-queue", // required
    
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
    
    });
    while(true){
        const {Messages} = await client.send(command);
        if(!Messages){
            console.log(`No messages`);
            continue;
        }
       try {
            for(const Message of Messages){
            const{ MessageId,Body} = Message;
            console.log(`Message Received:` ,{MessageId,Body});
            if(!Body) continue;
            const event = JSON.parse(Body) as S3Event;
            //validate that it is not a test event
            if("Service" in event && "Event" in event){
               if(event.Event=== "s3:TestEvent") {
                 await client.send(
                    new DeleteMessageCommand({
                      QueueUrl: "https://sqs.ap-south-1.amazonaws.com/021391128440/temp-video-queue",
                      ReceiptHandle: Message.ReceiptHandle,
                      
                    })
                  );
                  continue;
               }
            }
            //Spin the Docker container for each record
            for(const record of event.Records){
                const {s3} = record;
                const {bucket ,object:{key}} = s3;
                //spin the docker conatainer
                const command = new RunTaskCommand({
                  cluster: "arn:aws:ecs:ap-south-1:021391128440:cluster/himanshu_dev",
                  taskDefinition: "arn:aws:ecs:ap-south-1:021391128440:task-definition/video-transcoder",
                  launchType: "FARGATE",
                  networkConfiguration: {
                    awsvpcConfiguration: {
                      subnets: ["subnet-02f24d92a51c6091a","subnet-09d2400167188ecbd","subnet-073f73f5a8c176046"],
                      securityGroups: ["sg-0744a2fab9fedaca5"],
                      assignPublicIp: "ENABLED"
                    }
                  },
                  overrides: {
                      containerOverrides: [
                          {
                            name: "video-transcoder",
                            environment: [
                                { name: "Bucket", value: bucket.name },
                                { name: "Key", value: key }
                            ]
                          }
                      ]
                  }

                });
                  await ECSclient.send(command);
                  //delete the message from the queue
                  await client.send(
                    new DeleteMessageCommand({
                      QueueUrl: "https://sqs.ap-south-1.amazonaws.com/021391128440/temp-video-queue",
                      ReceiptHandle: Message.ReceiptHandle,
                    })
                  );
            }
            

        }
        
       } catch (error) {
        console.error("Error processing message", error);
        
       }
    }
}
init();