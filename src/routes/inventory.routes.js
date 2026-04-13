const express = require('express')
const multer = require('multer')
const inventoryController = require('../controllers/inventory.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)
    if (ok) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten imágenes JPEG, PNG, WebP o GIF'))
    }
  }
})

const router = express.Router()

router.get('/categories', inventoryController.listCategories)
router.post('/categories', inventoryController.createCategory)
router.get('/products', inventoryController.listProducts)
router.post('/products', inventoryController.create)
router.post(
  '/products/:id/image',
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        e.statusCode = 400
        return next(e)
      }
      next()
    })
  },
  inventoryController.uploadImage
)
router.get('/products/:id', inventoryController.getById)
router.put('/products/:id', inventoryController.update)
router.delete('/products/:id', inventoryController.remove)
router.patch('/products/:id/stock', inventoryController.adjustStock)
router.patch('/products/:id/min-stock', inventoryController.setMinStock)

module.exports = router
