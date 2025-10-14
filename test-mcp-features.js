#!/usr/bin/env node

/**
 * Simple test script to verify MCP Resources and Prompts
 */

import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('node', ['dist/server.js'], {
  env: {
    ...process.env,
    TDS_MCP_MAC_TOKEN: '{"kid":"test","token_type":"mac","mac_key":"test","mac_algorithm":"hmac-sha-1"}',
    TDS_MCP_CLIENT_ID: 'test',
    TDS_MCP_CLIENT_TOKEN: 'test'
  }
});

let responseData = '';

server.stdout.on('data', (data) => {
  responseData += data.toString();
});

server.stderr.on('data', (data) => {
  console.error('Server log:', data.toString());
});

// Wait for server to start
setTimeout(() => {
  console.log('\n🧪 Testing MCP Server Features\n');

  // Test 1: List Resources
  console.log('📖 Test 1: List Resources');
  const listResourcesRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'resources/list',
    params: {}
  };

  server.stdin.write(JSON.stringify(listResourcesRequest) + '\n');

  setTimeout(() => {
    // Test 2: Read a Resource
    console.log('\n📖 Test 2: Read Resource (docs://leaderboard/overview)');
    const readResourceRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/read',
      params: {
        uri: 'docs://leaderboard/overview'
      }
    };

    server.stdin.write(JSON.stringify(readResourceRequest) + '\n');

    setTimeout(() => {
      // Test 3: List Prompts
      console.log('\n🎨 Test 3: List Prompts');
      const listPromptsRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'prompts/list',
        params: {}
      };

      server.stdin.write(JSON.stringify(listPromptsRequest) + '\n');

      setTimeout(() => {
        // Test 4: Get a Prompt
        console.log('\n🎨 Test 4: Get Prompt (leaderboard-integration)');
        const getPromptRequest = {
          jsonrpc: '2.0',
          id: 4,
          method: 'prompts/get',
          params: {
            name: 'leaderboard-integration',
            arguments: {}
          }
        };

        server.stdin.write(JSON.stringify(getPromptRequest) + '\n');

        setTimeout(() => {
          console.log('\n✅ All tests sent!');
          console.log('\n📊 Response data:');
          console.log(responseData);

          // Kill server
          server.kill();
          process.exit(0);
        }, 1000);
      }, 1000);
    }, 1000);
  }, 1000);
}, 2000);

setTimeout(() => {
  console.error('\n❌ Timeout - killing server');
  server.kill();
  process.exit(1);
}, 10000);
