const handler = require('serve-handler');
const http = require('http');

const server = http.createServer((request, response) => {
  // Custom rewrite logic for proposal routes
  if (request.url.startsWith('/proposal/') && request.url !== '/proposal') {
    request.url = '/proposal.html';
  }
  
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
