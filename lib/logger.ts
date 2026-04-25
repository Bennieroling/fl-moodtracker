type Level = 'debug' | 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>

function log(level: Level, message: string, fields?: LogFields) {
  if (process.env.NODE_ENV === 'production') {
    process.stdout.write(JSON.stringify({ level, time: Date.now(), message, ...fields }) + '\n')
  } else {
    const prefix = `[${level.toUpperCase()}]`
    const extra = fields ? ' ' + JSON.stringify(fields) : ''
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`${prefix} ${message}${extra}`)
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => log('debug', message, fields),
  info: (message: string, fields?: LogFields) => log('info', message, fields),
  warn: (message: string, fields?: LogFields) => log('warn', message, fields),
  error: (message: string, fields?: LogFields) => log('error', message, fields),
}
