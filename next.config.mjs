/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Temporal client speaks gRPC and ships native-ish deps; keep it out of
  // the bundler so it runs as a normal Node module inside route handlers.
  serverExternalPackages: [
    "@temporalio/client",
    "@temporalio/common",
    "@temporalio/proto",
    "@grpc/grpc-js",
  ],
};

export default nextConfig;
