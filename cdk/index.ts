#!/usr/bin/env node

/**
 *This module provides source map support for stack traces in node via the V8 stack trace API.
 It uses the source-map module to replace the paths and line numbers of source-mapped files
 with their original paths and line numbers. The output mimics the node's stack trace format
 with the goal of making every compile-to-JS language more of a first-class citizen.
 Source maps are completely general (not specific to any one language)
  so you can use source maps with multiple compile-to-JS languages in the same node process.
 */
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { DatabaseStack } from "./stack";

process.env.SERVICE_NAME = "aws-node-project";

const app = new App();

new DatabaseStack(app, "DatabaseStack", {
  vpcName: "vpc-0878da24212b5aeb5",
  databaseName: "myDatabase",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
