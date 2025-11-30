/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    
    // Fix for MetaMask SDK trying to use React Native packages in web
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
      }
    }
    
    // Ignore React Native modules in web build
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    }
    
    // Fix for indexedDB during SSR (Wagmi/RainbowKit)
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'indexeddb': false,
      }
    }
    
    return config
  },
};

module.exports = nextConfig;
