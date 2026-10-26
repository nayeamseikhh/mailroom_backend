import rateLimit from 'express-rate-limit'

const message = { message: 'Too many attempts. Please try again in a few minutes.' }

// Tight limit on credential endpoints to slow down brute-force attacks.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(message),
})

// Looser limit for general API traffic.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(message),
})

export const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    message: 'Too many contact import attempts. Please try again in a few minutes.',
  }),
})

export const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    message: 'Too many campaign send attempts. Please try again later.',
  }),
})

export default authLimiter
