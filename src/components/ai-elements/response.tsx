import { cn } from '@/lib/utils'
import { type ComponentProps, Component, memo, type ReactNode } from 'react'
import { Streamdown } from 'streamdown'

type ResponseProps = ComponentProps<typeof Streamdown>

interface StreamdownErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class StreamdownErrorBoundary extends Component<
  { children: ReactNode; rawContent?: string },
  StreamdownErrorBoundaryState
> {
  constructor(props: { children: ReactNode; rawContent?: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): StreamdownErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[Response] Streamdown render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      const { rawContent } = this.props
      return (
        <div className="space-y-2">
          {rawContent ? (
            <pre className="whitespace-pre-wrap break-words text-sm">{rawContent}</pre>
          ) : (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-medium">Failed to render response content.</p>
              <p className="mt-1 text-xs opacity-80">
                The message may be too large or contain unsupported formatting.
              </p>
            </div>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

function getRawResponseContent(children: ReactNode): string | undefined {
  return typeof children === 'string' ? children : undefined
}

export const Response = memo(({ className, ...props }: ResponseProps) => (
  <StreamdownErrorBoundary rawContent={getRawResponseContent(props.children)}>
    <Streamdown
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 code-bg prose prose-sm dark:prose-invert max-w-none', className)}
      {...props}
    />
  </StreamdownErrorBoundary>
))

Response.displayName = 'Response'
