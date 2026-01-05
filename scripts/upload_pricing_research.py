#!/usr/bin/env python3
"""
Upload AI Music Studio pricing research to Firestore
"""

import json
from google.cloud import firestore
from datetime import datetime

def upload_pricing_research():
    """Upload pricing research JSON to Firestore"""

    # Initialize Firestore client
    db = firestore.Client(project='truckerbooks-mvp-prod')

    # Load the research data
    with open('/home/jasoncrites/products/ai-music-studio/research/pricing-monetization-analysis.json', 'r') as f:
        research_data = json.load(f)

    # Add upload metadata
    research_data['uploaded_at'] = datetime.utcnow()
    research_data['uploaded_by'] = 'claude-sonnet-4-5'
    research_data['version'] = 'v1.0'
    research_data['status'] = 'active'

    # Main document path
    doc_ref = db.collection('ai_music_studio').document('pricing_strategy').collection('research').document('v1_2026_01_05')

    # Upload main research document
    doc_ref.set(research_data)
    print(f"✓ Uploaded main research document to Firestore")

    # Upload individual tier configurations for easy querying
    tiers = research_data['recommended_pricing_tiers']['tier_structure']
    for tier_name, tier_data in tiers.items():
        tier_ref = db.collection('ai_music_studio').document('pricing_strategy').collection('tiers').document(tier_name)
        tier_ref.set({
            **tier_data,
            'tier_id': tier_name,
            'updated_at': datetime.utcnow()
        })
        print(f"✓ Uploaded tier: {tier_name}")

    # Upload competitor analysis for benchmarking
    competitors = research_data['competitor_pricing']
    comp_ref = db.collection('ai_music_studio').document('pricing_strategy').collection('competitors').document('analysis_2026_01_05')
    comp_ref.set({
        'competitors': competitors,
        'updated_at': datetime.utcnow()
    })
    print(f"✓ Uploaded competitor analysis")

    # Upload B2B pricing models
    b2b_pricing = research_data['recommended_pricing_tiers']['b2b_api_pricing']
    b2b_ref = db.collection('ai_music_studio').document('pricing_strategy').collection('b2b_models').document('api_pricing')
    b2b_ref.set({
        **b2b_pricing,
        'updated_at': datetime.utcnow()
    })
    print(f"✓ Uploaded B2B API pricing")

    # Upload white-label reseller model
    white_label = research_data['recommended_pricing_tiers']['white_label_reseller']
    wl_ref = db.collection('ai_music_studio').document('pricing_strategy').collection('b2b_models').document('white_label')
    wl_ref.set({
        **white_label,
        'updated_at': datetime.utcnow()
    })
    print(f"✓ Uploaded white-label pricing")

    # Upload key insights for quick reference
    insights = research_data['key_insights']
    insights_ref = db.collection('ai_music_studio').document('pricing_strategy').collection('analytics').document('key_insights')
    insights_ref.set({
        **insights,
        'updated_at': datetime.utcnow()
    })
    print(f"✓ Uploaded key insights")

    # Create index document for easy discovery
    index_ref = db.collection('ai_music_studio').document('pricing_strategy')
    index_ref.set({
        'latest_version': 'v1_2026_01_05',
        'last_updated': datetime.utcnow(),
        'status': 'active',
        'subcollections': [
            'research',
            'tiers',
            'competitors',
            'b2b_models',
            'analytics'
        ],
        'description': 'AI Music Studio pricing strategy and monetization research',
        'total_sources': len(research_data['sources'])
    })
    print(f"✓ Created index document")

    print("\n=== Upload Complete ===")
    print(f"Firestore path: ai_music_studio/pricing_strategy")
    print(f"Total tiers: {len(tiers)}")
    print(f"Research version: v1_2026_01_05")
    print(f"Status: Active")

if __name__ == '__main__':
    upload_pricing_research()
