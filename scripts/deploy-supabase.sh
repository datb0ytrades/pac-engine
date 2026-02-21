#!/bin/bash
# ============================================================================
# Deploy Supabase Edge Functions + Migrations to Production
# Run from project root: ./scripts/deploy-supabase.sh
# ============================================================================

set -e

echo "=== PAC Engine - Supabase Production Deploy ==="

# Check supabase CLI
if ! command -v supabase &> /dev/null; then
  echo "Error: supabase CLI not installed. Run: brew install supabase/tap/supabase"
  exit 1
fi

# Verify linked project
echo ""
echo "1. Checking Supabase project link..."
if ! supabase db remote status &> /dev/null 2>&1; then
  echo "Error: Project not linked. Run first:"
  echo "  supabase link --project-ref <your-project-ref>"
  exit 1
fi

# Push migrations
echo ""
echo "2. Pushing database migrations..."
supabase db push

# Set secrets (uncomment and fill values before running)
echo ""
echo "3. Setting edge function secrets..."
echo "   (Uncomment the lines below with your actual values)"
echo ""
echo "   supabase secrets set \\"
echo "     SIGNING_SERVICE_URL=https://your-signing-service.railway.app \\"
echo "     SIGNING_SERVICE_SECRET=your-secret \\"
echo "     ANTHROPIC_API_KEY=your-key \\"
echo "     DGI_ENVIRONMENT=production"

# Deploy all edge functions
echo ""
echo "4. Deploying edge functions..."
supabase functions deploy emit-document
supabase functions deploy get-document
supabase functions deploy cancel-document
supabase functions deploy generate-cafe-pdf
supabase functions deploy categorize-expense
supabase functions deploy scan-receipt

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Verify:"
echo "  - Edge functions: https://supabase.com/dashboard → Functions"
echo "  - Database: https://supabase.com/dashboard → Table Editor"
echo "  - Storage buckets: https://supabase.com/dashboard → Storage"
