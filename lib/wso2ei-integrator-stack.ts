import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as acm from "aws-cdk-lib/aws-certificatemanager";

export class Wso2EiIntegratorStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            vpcName: 'Blog',
        });

        const cluster = new ecs.Cluster(this, "Cluster", {
            vpc: vpc,
            clusterName: "wso2-integrator",
        });

        const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
            vpc: vpc,
            internetFacing: true,
            loadBalancerName: 'wso2-integrator'
        });

        /* DNS, DOMAINS, CERTS */
        // I'm using a domain I own: thabolebelo.com
        const zone = route53.HostedZone.fromLookup(this, 'HostedZone', {
            domainName: 'thabolebelo.com'
        });

        const cert = new acm.Certificate(this, 'Certificate', {
            domainName: 'wso2-integrator.thabolebelo.com',
            validation: acm.CertificateValidation.fromDns(zone)
        });

        // Create DNS record to point to the load balancer
        new route53.ARecord(this, 'DNS', {
            zone: zone,
            target: route53.RecordTarget.fromAlias(
                new route53Targets.LoadBalancerTarget(alb)
            ),
            ttl: Duration.seconds(300),
            comment: 'URL to access the WSO2 Enterprise Integrator',
            recordName: 'wso2-integrator'
        });

        const repo = ecr.Repository.fromRepositoryArn(this, "Repo",
            "arn:aws:ecr:us-east-1:737327749629:repository/wso2ei-integrator"
        );

        const image = ecs.ContainerImage.fromEcrRepository(repo, '6.4.0');

        const task = new ecs.TaskDefinition(this, 'Task', {
            cpu: "512",
            memoryMiB: "1024",
            compatibility: ecs.Compatibility.EC2_AND_FARGATE,
            networkMode: ecs.NetworkMode.AWS_VPC,
        });

        const container = task.addContainer('Container', {
            image: image,
            memoryLimitMiB: 1024,
            logging: ecs.LogDriver.awsLogs({ streamPrefix: "wso2-integrator" })
        });

        container.addPortMappings({
            containerPort: 9443,
            protocol: ecs.Protocol.TCP
        });

        const service = new ecs.FargateService(this, "Service", {
            cluster: cluster,
            taskDefinition: task,
            serviceName: 'integrator-profile',
        });

        const scaling = service.autoScaleTaskCount({ maxCapacity: 3, minCapacity: 1 });
        
        // Auto-Scaling depending on CPU utilization
        scaling.scaleOnCpuUtilization('autoscale', {
            targetUtilizationPercent: 50,
            scaleInCooldown: Duration.minutes(2),
            scaleOutCooldown: Duration.seconds(30)
        });

        /* CONFIGURE ALB DEFAULT LISTENER */
        const listener = alb.addListener('port9443Listener', { 
            port: 9443,
            certificates: [cert],
            protocol: elbv2.ApplicationProtocol.HTTPS
        });
        
        listener.addTargets('service', {
            port: 9443,
            targets: [service],
            protocol: elbv2.ApplicationProtocol.HTTPS,
            targetGroupName: 'integrator-profile',
            healthCheck: {
                path: '/services/Version',
                protocol: elbv2.Protocol.HTTPS,
                unhealthyThresholdCount: 3
            }
        });

    }
}
