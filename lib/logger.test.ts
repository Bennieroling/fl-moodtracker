import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'

describe('logger (dev mode)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('info calls console.log with [INFO] prefix', () => {
    logger.info('hello world')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[INFO] hello world'))
  })

  it('debug calls console.log with [DEBUG] prefix', () => {
    logger.debug('debugging')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] debugging'))
  })

  it('warn calls console.warn with [WARN] prefix', () => {
    logger.warn('watch out')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN] watch out'))
  })

  it('error calls console.error with [ERROR] prefix', () => {
    logger.error('something broke')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR] something broke'))
  })

  it('appends JSON-serialized fields to the log line', () => {
    logger.info('with fields', { requestId: 'req-1', count: 3 })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-1"'))
  })
})

describe('logger (production mode)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('writes JSON to stdout', () => {
    logger.info('prod message')
    expect(stdoutSpy).toHaveBeenCalled()
    const written = String((stdoutSpy.mock.calls[0] as unknown[])[0])
    const parsed = JSON.parse(written)
    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('prod message')
    expect(typeof parsed.time).toBe('number')
  })

  it('includes extra fields in JSON output', () => {
    logger.error('oops', { requestId: 'req-99' })
    const written = String((stdoutSpy.mock.calls[0] as unknown[])[0])
    const parsed = JSON.parse(written)
    expect(parsed.requestId).toBe('req-99')
    expect(parsed.level).toBe('error')
  })
})
