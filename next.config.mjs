/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  compress: true,
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: [
          'C:/swapfile.sys',
          'C:/hiberfil.sys',
          'C:/pagefile.sys',
          'C\\swapfile.sys',
          'C\\hiberfil.sys',
          'C\\pagefile.sys',
        ],
      }
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)\\.(png|jpg|jpeg|gif|svg|webp|ico)$',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/public/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/api/reports/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache' },
        ],
      },
    ]
  },
}

export default nextConfig
