#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Wso2EiIntegratorStack } from '../lib/wso2ei-integrator-stack';

const app = new cdk.App();
new Wso2EiIntegratorStack(app, 'Wso2EiIntegratorStack', {
    env: { account: '858735049384', region: 'af-south-1' },
    stackName: 'wso2ei-integrator',
    description: 'Integrator profile instance'
});