# Terraform Bootstrap

Run this once to create the S3 bucket and DynamoDB table for Terraform state.

```bash
cd terraform/bootstrap
terraform init
terraform apply
```

Then run the main Terraform from the parent directory:

```bash
cd ..
terraform init -backend-config=backend.hcl
terraform workspace new staging
terraform workspace select staging
terraform plan -var-file=environments/staging/terraform.tfvars
```
