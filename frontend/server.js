const handler = require('serve-handler');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((request, response) => {
  const url = request.url;
  
  // Handle proposal routes directly - bypass serve-handler completely
  if (url.startsWith('/proposal/') || url === '/proposal') {
    const proposalPath = path.join(__dirname, 'public', 'proposal.html');
    fs.readFile(proposalPath, 'utf8', (err, content) => {
      if (err) {
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end('Error loading proposal page');
        return;
      }
      response.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-XSS-Protection': '1; mode=block'
      });
      response.end(content);
    });
    return;
  }
  
  // For all other routes, use serve-handler
  return handler(request, response, {
    public: 'public',
    cleanUrls: true,
    directoryListing: false,
    headers: [
      {
        source: '**/*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' }
        ]
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
