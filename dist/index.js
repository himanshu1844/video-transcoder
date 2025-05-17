"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_ecs_1 = require("@aws-sdk/client-ecs");
require('dotenv').config();
const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;
if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are not set in environment variables.");
}
const client = new client_sqs_1.SQSClient({
    region: "ap-south-1",
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
    },
});
const ECSclient = new client_ecs_1.ECSClient({
    region: "ap-south-1",
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
    },
});
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        const command = new client_sqs_1.ReceiveMessageCommand({
            QueueUrl: "https://sqs.ap-south-1.amazonaws.com/021391128440/temp-video-queue", // required
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
        });
        while (true) {
            const { Messages } = yield client.send(command);
            if (!Messages) {
                console.log(`No messages`);
                continue;
            }
            try {
                for (const Message of Messages) {
                    const { MessageId, Body } = Message;
                    console.log(`Message Received:`, { MessageId, Body });
                    if (!Body)
                        continue;
                    const event = JSON.parse(Body);
                    //validate that it is not a test event
                    if ("Service" in event && "Event" in event) {
                        if (event.Event === "s3:TestEvent") {
                            yield client.send(new client_sqs_1.DeleteMessageCommand({
                                QueueUrl: "https://sqs.ap-south-1.amazonaws.com/021391128440/temp-video-queue",
                                ReceiptHandle: Message.ReceiptHandle,
                            }));
                            continue;
                        }
                    }
                    //Spin the Docker container for each record
                    for (const record of event.Records) {
                        const { s3 } = record;
                        const { bucket, object: { key } } = s3;
                        //spin the docker conatainer
                        const command = new client_ecs_1.RunTaskCommand({
                            cluster: "arn:aws:ecs:ap-south-1:021391128440:cluster/himanshu_dev",
                            taskDefinition: "arn:aws:ecs:ap-south-1:021391128440:task-definition/video-transcoder",
                            launchType: "FARGATE",
                            networkConfiguration: {
                                awsvpcConfiguration: {
                                    subnets: ["subnet-02f24d92a51c6091a", "subnet-09d2400167188ecbd", "subnet-073f73f5a8c176046"],
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
                        yield ECSclient.send(command);
                        //delete the message from the queue
                        yield client.send(new client_sqs_1.DeleteMessageCommand({
                            QueueUrl: "https://sqs.ap-south-1.amazonaws.com/021391128440/temp-video-queue",
                            ReceiptHandle: Message.ReceiptHandle,
                        }));
                    }
                }
            }
            catch (error) {
                console.error("Error processing message", error);
            }
        }
    });
}
init();
