# Blue/green deployments aren't supported for the following features:
# - Amazon RDS Proxy
# - Cascading read replicas
# - Cross-Region read replicas
# - AWS CloudFormation
# - Multi-AZ DB cluster deployments
aws rds create-blue-green-deployment \
    --blue-green-deployment-name bg-databaseclusterconstructdatabasecluster \
    --source your-cluster-arn \
    --target-engine-version 8.0 \
    --region us-east-1
