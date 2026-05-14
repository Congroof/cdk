#!/bin/bash
set -e

nginx

exec /usr/local/bin/cdk-server
