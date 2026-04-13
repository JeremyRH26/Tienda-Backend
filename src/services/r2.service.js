const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const path = require('path')
const crypto = require('crypto')

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const publicBase = process.env.R2_PUBLIC_BASE_URL
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    return null
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase }
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg'
  if (m === 'image/png') return '.png'
  if (m === 'image/webp') return '.webp'
  if (m === 'image/gif') return '.gif'
  return ''
}

function clientFromConfig(cfg) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    },
    forcePathStyle: true
  })
}

exports.isConfigured = () => r2Config() != null

exports.uploadProductImage = async ({ buffer, contentType, productId, originalName }) => {
  const cfg = r2Config()
  if (!cfg) {
    const err = new Error(
      'R2 no configurado: defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_PUBLIC_BASE_URL'
    )
    err.statusCode = 503
    throw err
  }

  let ext = extFromMime(contentType)
  if (!ext && originalName) {
    ext = path.extname(originalName).slice(0, 8)
  }
  if (!ext) {
    ext = '.bin'
  }

  const key = `products/${Number(productId)}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`

  await clientFromConfig(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream'
    })
  )

  const base = cfg.publicBase.replace(/\/$/, '')
  return `${base}/${key}`
}
