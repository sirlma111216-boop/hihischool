import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('화면 오류', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="hint bad" role="alert">
          <strong>화면을 그리는 중 오류가 발생했습니다.</strong> {this.state.error.message}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn secondary sm" onClick={() => this.setState({ error: null })}>다시 시도</button>{' '}
            <a className="btn quiet sm" href="/">홈으로</a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
