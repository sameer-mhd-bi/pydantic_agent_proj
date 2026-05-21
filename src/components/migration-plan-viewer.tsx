import { useState } from 'react'
import { Download, Loader } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  generatePdfFilename,
} from '@/lib/migration-plan-parser'

interface MigrationPlanViewerProps {
  plan: string
  editable: string
  onEditableChange: (value: string) => void
  onSave: () => Promise<void>
  isSaving: boolean
}

export function MigrationPlanViewer({
  plan,
  editable,
  onEditableChange,
  onSave,
  isSaving,
}: MigrationPlanViewerProps) {
  const [isExporting, setIsExporting] =
    useState(false)

  const generatePdf = async () => {
    try {
      setIsExporting(true)

      // Dynamically import jsPDF
      const { default: jsPDF } = await import(
        'jspdf'
      )

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = pdf.internal.pageSize
        .getWidth()
      const pageHeight =
        pdf.internal.pageSize.getHeight()
      const margin = 10
      const contentWidth = pageWidth - margin * 2
      let yPosition = margin

      // Add title
      pdf.setFontSize(16)
      pdf.setFont(undefined, 'bold')
      pdf.text(
        'PostgreSQL to Snowflake Migration Plan',
        margin,
        yPosition,
      )
      yPosition += 15

      // Add content with text wrapping
      pdf.setFontSize(11)
      pdf.setFont(undefined, 'normal')

      const lines = pdf.splitTextToSize(
        editable,
        contentWidth,
      )

      lines.forEach((line: string) => {
        // Check if we need a new page
        if (yPosition > pageHeight - margin) {
          pdf.addPage()
          yPosition = margin
        }

        pdf.text(line, margin, yPosition)
        yPosition += 6
      })

      // Download
      pdf.save(generatePdfFilename())
      toast.success(
        'Migration plan exported as PDF',
      )
    } catch (error) {
      console.error('PDF generation error:', error)
      toast.error('Failed to generate PDF')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold">
        Migration Plan (Editable)
      </label>

      <textarea
        value={editable}
        onChange={(e) =>
          onEditableChange(e.target.value)
        }
        className="w-full h-96 p-3 border rounded-lg font-mono text-sm bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Migration plan will appear here..."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={generatePdf}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </>
          )}
        </Button>

        <Button
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Migration Plan'
          )}
        </Button>
      </div>
    </div>
  )
}
