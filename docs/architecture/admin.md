# Admin

We have a main admin panel admin.tsx that routes to admin sub-panels

## Taxonomy Editor

Manage sound metadata, such as instrument families and types

## Network Monitor

Monitor network requests from the backend

## Queue Dashboard

Monitor pg-boss jobs

- design mirrors that of bull-board
- left column is a list of queues
- main panel has columns for active, waiting, waiting children, completed, failed, delayed, paused jobs
- tap a queue and a column name to show the jobs in that state ('job cards').
- job cards are custom components per queue. for example a sample-analysis card shows filename
- tap a job card to show a custom detail component for that queue. for example the request, response or formatted input and outputs


