import nodemailer from 'nodemailer'

export function createMailerTransport(credentials) {
  return nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    requireTLS: !credentials.secure,
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 60000,
    auth: { user: credentials.username, pass: credentials.password },
  })
}
