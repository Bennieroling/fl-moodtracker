import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fix for hydration issues with ThemeProvider
  transpilePackages: ['next-themes'],

  // Enable strict mode for better development experience
  reactStrictMode: true,
  
  // PoweredByHeader for security
  poweredByHeader: false,
  
  // Compression
  compress: true,
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
