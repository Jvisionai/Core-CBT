/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // Docker 배포용: .next/standalone 에 최소 실행 파일만 모은다.
  output: 'standalone',
};

export default nextConfig;
