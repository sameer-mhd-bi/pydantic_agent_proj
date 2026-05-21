/**
 * Utility functions for migration plan handling
 */

export function generatePdfFilename(): string {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .split('T')[0]
    .replace(/-/g, '')
  return `migration-plan-${timestamp}.pdf`
}
