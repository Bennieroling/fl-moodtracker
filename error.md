## Error Type
Console Error

## Error Message
Mood entry data: {}


    at upsertMoodEntry (lib/database.ts:119:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:145:7)

## Code Frame
  117 |     console.error('Error constructor:', error?.constructor?.name)
  118 |     console.error('Error keys:', Object.keys(error || {}))
> 119 |     console.error('Mood entry data:', moodEntry)
      |             ^
  120 |     
  121 |     // Try to get more error details
  122 |     let errorMessage = 'Unknown error'

Next.js version: 15.5.2 (Webpack)

## Error Type
Console Error

## Error Message
Connection test failed: "Connection failed"


    at upsertMoodEntry (lib/database.ts:101:15)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
   99 |     const connectionTest = await testConnection()
  100 |     if (!connectionTest.success) {
> 101 |       console.error('Connection test failed:', connectionTest.error)
      |               ^
  102 |       throw new Error(`Database connection failed: ${connectionTest.error}`)
  103 |     }
  104 |

Next.js version: 15.5.2 (Webpack)

## Error Type
Console Error

## Error Message
Database connection failed: Connection failed


    at upsertMoodEntry (lib/database.ts:102:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
  100 |     if (!connectionTest.success) {
  101 |       console.error('Connection test failed:', connectionTest.error)
> 102 |       throw new Error(`Database connection failed: ${connectionTest.error}`)
      |             ^
  103 |     }
  104 |
  105 |     console.log('Database connection successful, proceeding with upsert')

Next.js version: 15.5.2 (Webpack)

## Error Type
Console Error

## Error Message
Error type: "object"


    at upsertMoodEntry (lib/database.ts:130:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
  128 |   } catch (error) {
  129 |     console.error('Error upserting mood entry:', error)
> 130 |     console.error('Error type:', typeof error)
      |             ^
  131 |     console.error('Error constructor:', error?.constructor?.name)
  132 |     console.error('Error keys:', Object.keys(error || {}))
  133 |     console.error('Mood entry data:', moodEntry)

Next.js version: 15.5.2 (Webpack)


## Error Type
Console Error

## Error Message
Error constructor: "Error"


    at upsertMoodEntry (lib/database.ts:131:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
  129 |     console.error('Error upserting mood entry:', error)
  130 |     console.error('Error type:', typeof error)
> 131 |     console.error('Error constructor:', error?.constructor?.name)
      |             ^
  132 |     console.error('Error keys:', Object.keys(error || {}))
  133 |     console.error('Mood entry data:', moodEntry)
  134 |     

Next.js version: 15.5.2 (Webpack)

## Error Type
Console Error

## Error Message
Error keys: []


    at upsertMoodEntry (lib/database.ts:132:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
  130 |     console.error('Error type:', typeof error)
  131 |     console.error('Error constructor:', error?.constructor?.name)
> 132 |     console.error('Error keys:', Object.keys(error || {}))
      |             ^
  133 |     console.error('Mood entry data:', moodEntry)
  134 |     
  135 |     // Try to get more error details

Next.js version: 15.5.2 (Webpack)



## Error Type
Console Error

## Error Message
Mood entry data: {}


    at upsertMoodEntry (lib/database.ts:133:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
  131 |     console.error('Error constructor:', error?.constructor?.name)
  132 |     console.error('Error keys:', Object.keys(error || {}))
> 133 |     console.error('Mood entry data:', moodEntry)
      |             ^
  134 |     
  135 |     // Try to get more error details
  136 |     let errorMessage = 'Unknown error'

Next.js version: 15.5.2 (Webpack)




## Error Type
Console Error

## Error Message
Processed error message: "Database connection failed: Connection failed"


    at upsertMoodEntry (lib/database.ts:145:13)
    at async handleMoodSave (app/(app)/dashboard/page.tsx:167:7)

## Code Frame
  143 |     }
  144 |     
> 145 |     console.error('Processed error message:', errorMessage)
      |             ^
  146 |     
  147 |     // Check if it's an authentication error or connection issue
  148 |     const isAuthError = errorMessage.includes('JWT') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')

Next.js version: 15.5.2 (Webpack)
