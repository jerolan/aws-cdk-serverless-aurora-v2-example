# Run on the region where the cluster is desired to be created, different from the source cluster region
aws rds create-db-cluster \
    --db-cluster-identifier databaseclusterconstructdatabasecluster \
    --engine aurora-mysql \
    --engine-version 8.0.mysql_aurora.3.02.0 \
    --replication-source-identifier your-cluster-arn \
    --kms-key-id your-key-id-arn \
    --storage-encrypted
