import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stable configuration for React 18
  experimental: {
    esmExternals: 'loose', // For better compatibility
  },
  
  // Webpack configuration to handle chunk loading issues
  webpack: (config, { isServer }) => {
    // Fix for chunk loading timeouts
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Optimize chunks for better loading
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    };

    return config;
  },

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
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};
