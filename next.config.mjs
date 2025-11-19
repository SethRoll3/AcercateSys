/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mantenemos esto si tienes prisa por entregar y hay errores de linter
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // AQUÍ EL CAMBIO IMPORTANTE: Activamos la optimización
  images: {
    // Quitamos unoptimized: true
    remotePatterns: [
      {
        protocol: 'https',
        // Lo encuentras en tu dashboard de Supabase URL
        hostname: 'lihgzgxeyxokedjqmmxp.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  
  compress: true,
  
  // Dejamos tu config de webpack tal cual
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

  // Tus headers están bien
  async headers() {
    return [
      {
        source: '/(.*)\\.(png|jpg|jpeg|gif|svg|webp|ico)$',
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