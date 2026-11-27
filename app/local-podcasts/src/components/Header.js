import { useContext } from 'react'
import { Box, Button, ResponsiveContext, Text, TextInput } from 'grommet'
import { Previous, Search as SearchIcon } from 'grommet-icons'
import { useNavigate } from 'react-router-dom'

// Shared sticky top bar used by every page: optional back button, optional
// title, optional search box, and a row of trailing action buttons. Kept
// as one component so header layout/spacing/responsiveness only needs to
// be solved once rather than re-implemented per page.
export function Header({ title, back, search, actions }) {
  const navigate = useNavigate()
  const size = useContext(ResponsiveContext)
  const compact = size === 'small'

  return (
    <Box
      direction="row"
      align="center"
      gap="small"
      flex={{ shrink: 0 }}
      pad={{ horizontal: compact ? 'small' : 'medium', vertical: 'small' }}
      background="background"
      border={{ side: 'bottom', color: 'border', size: 'xsmall' }}
      style={{ position: 'sticky', top: 0, zIndex: 10 }}
    >
      {back !== false && (
        <Button
          icon={<Previous />}
          onClick={() => navigate(typeof back === 'string' ? back : -1)}
          plain
          hoverIndicator
          style={{ padding: '8px', borderRadius: '8px' }}
        />
      )}

      {title && !search && (
        <Text size={compact ? 'medium' : 'large'} weight="bold" truncate>
          {title}
        </Text>
      )}

      {search && (
        <Box
          flex
          direction="row"
          align="center"
          gap="xsmall"
          background="background-contrast"
          round="small"
          pad={{ horizontal: 'small' }}
          style={{ maxWidth: compact ? 'none' : '420px' }}
        >
          <SearchIcon size="small" color="text-xweak" />
          <TextInput
            placeholder={search.placeholder || 'Search'}
            value={search.value}
            onChange={search.onChange}
            plain
            focusIndicator={false}
          />
        </Box>
      )}

      {!search && <Box flex />}

      {actions && (
        <Box direction="row" align="center" gap="xsmall" flex={{ shrink: 0 }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
