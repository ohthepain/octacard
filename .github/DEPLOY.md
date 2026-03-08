# GitHub Actions Deployment

The `ci.yml` workflow builds, tests, then deploys (deploy jobs run only after build-and-test succeeds):

- **dev** branch → staging (ECS)
- **main** branch → production (ECS)

Deploy jobs run only on push (not PR) and only after build-and-test succeeds. OIDC uses the branch ref from the push, so credentials work correctly.

## Prerequisites: AWS OIDC

Configure GitHub OIDC so Actions can assume IAM roles without long-lived credentials.

### 1. Create GitHub OIDC identity provider (one-time)

If not already done, add GitHub as an OIDC provider in IAM:

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

### 2. Create IAM roles for staging and production

Each environment needs an IAM role with a trust policy for your repo. Example for staging:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/octacard:ref:refs/heads/dev"
        }
      }
    }
  ]
}
```

For production, use `ref:refs/heads/main` in the `sub` condition.

### 3. Attach permissions to each role

Each role needs:

- **ECR**: `GetAuthorizationToken`, `BatchGetImage`, `BatchCheckLayerAvailability`, `PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`
- **ECS**: `UpdateService`, `DescribeServices`, `DescribeTaskDefinition`, `RegisterTaskDefinition`
- **S3**: `GetObject` on `octacard-tf-state` (for Terraform state)

Or use a policy like `AmazonEC2ContainerRegistryPowerUser` + `AmazonECS_FullAccess` + S3 read on the state bucket.

### 4. Add repository secrets

In GitHub: **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|--------|-------|
| `AWS_ROLE_ARN_STAGING` | `arn:aws:iam::ACCOUNT_ID:role/github-actions-octacard-staging` |
| `AWS_ROLE_ARN_PRODUCTION` | `arn:aws:iam::ACCOUNT_ID:role/github-actions-octacard-production` |

### 5. Create the dev branch (if needed)

```bash
git checkout -b dev
git push -u origin dev
```

Pushes to `dev` will deploy to staging; pushes to `main` will deploy to production.
