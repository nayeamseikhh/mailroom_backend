import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import errorHandler from './middleware/errorHandler.js'
import authRoutes from './routes/authRoutes.js'
import contactRoutes from './routes/contactRoutes.js'
import listRoutes from './routes/listRoutes.js'
import settingsRoutes from './routes/settingsRoutes.js'
import campaignRoutes from './routes/campaignRoutes.js'
import inboxRoutes from './routes/inboxRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import templateRoutes from './routes/templateRoutes.js'
import mongoose from 'mongoose'

const app = express()

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'database_unavailable',
    database: databaseConnected ? 'connected' : 'disconnected',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/lists', listRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/inbox', inboxRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/templates', templateRoutes)

app.use((req, res, next) => {
  const error = new Error(`Route ${req.method} ${req.originalUrl} not found.`)
  error.statusCode = 404
  next(error)
})

app.use(errorHandler)

export default app
