# Employee Onboarding Automation – Part 1

## Overview

This project implements Part 1 of the employee onboarding automation solution using Node.js.

The application:
1. Retrieves employee data from the public employee API.
2. Extracts employee ID, name, salary, and age.
3. Assigns queue priority based on salary.
4. Authenticates with UiPath Orchestrator using OAuth.
5. Adds employee records to the `New Hires` queue.

## Priority Rules

- **High**: Salary greater than 300,000
- **Normal**: Salary from 100,000 to 300,000
- **Low**: Salary below 100,000

## Technology Used

- Node.js 18 or later
- AWS Lambda-compatible Node.js handler
- UiPath Orchestrator Queue API
- OAuth 2.0 client credentials
- dotenv for local environment configuration

## Project Structure

```text
Part1-AWS-Lambda-Dispatcher
├── index.mjs
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
└── README.md
```

## Configuration

Create a `.env` file in the project folder using `.env.example` as the template.

```env
DRY_RUN=false
EMPLOYEE_API_URL=https://dummy.restapiexample.com/api/v1/employees
UIPATH_QUEUE_NAME=New Hires
UIPATH_TOKEN_URL=https://cloud.uipath.com/identity_/connect/token
UIPATH_CLIENT_ID=your_client_id
UIPATH_CLIENT_SECRET=your_client_secret
UIPATH_SCOPE=OR.Queues
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/your_org/your_tenant/orchestrator_
UIPATH_FOLDER_ID=your_folder_id
```

Do not commit the `.env` file because it contains credentials.

## Installation

```bash
npm install
```

## Run Locally

```bash
node index.mjs
```

or:

```bash
npm start
```

## Dry Run

To test API retrieval and priority calculation without adding queue items:

```env
DRY_RUN=true
```

## UiPath Queue Upload

To add employee records to the UiPath queue:

```env
DRY_RUN=false
```

The UiPath queue must already exist with the name `New Hires`.

## Queue Item Data

Each queue item contains:

```text
EmployeeID
EmployeeName
EmployeeSalary
EmployeeAge
```

The queue priority is set to High, Normal, or Low based on salary.

## Queue Reference

A unique queue reference is generated using employee ID and timestamp.

Example:

```text
Employee_21_20260711T123045123Z
```

## AWS Lambda Deployment

The source file is compatible with AWS Lambda.

Lambda handler:

```text
index.handler
```

In AWS Lambda, configure the UiPath values under:

```text
Configuration → Environment variables
```

For production use, store sensitive credentials in AWS Secrets Manager.

## Error Handling

The application handles:
- HTTP 429 rate-limit responses
- Invalid employee records
- UiPath authentication failures
- Queue upload failures
- Duplicate queue references
- Missing environment variables

## Security

Do not upload:

```text
.env
node_modules/
```

Recommended `.gitignore`:

```gitignore
.env
**/.env
node_modules/
**/node_modules/
```

## Execution Flow

```text
Employee API
→ Retrieve employee records
→ Validate employee data
→ Calculate queue priority
→ Generate UiPath access token
→ Add queue transactions
→ Log execution summary
```
