import './config/env.js'
import app from './app.js'
import connectDatabase from './config/db.js'
import { validateJwtSecret } from './utils/generateToken.js'
import { startCampaignQueue } from './services/queueService.js'

const port = Number(process.env.PORT || 5001)

try {
  validateJwtSecret()
  await connectDatabase()
  await startCampaignQueue()
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`)
  })
} catch (error) {
  console.error(`Could not start API server: ${error.message}`)
  process.exitCode = 1
}
