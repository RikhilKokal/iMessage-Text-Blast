export const VARIABLES = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName',  label: 'Last Name'  },
  { key: 'fullName',  label: 'Full Name'  },
  { key: 'email',     label: 'Email'      },
  { key: 'phone',     label: 'Phone'      },
  { key: 'company',   label: 'Company'    },
  { key: 'nickname',  label: 'Nickname'   },
]

export const TOKEN_LABELS = Object.fromEntries(VARIABLES.map(v => [v.key, v.label]))
