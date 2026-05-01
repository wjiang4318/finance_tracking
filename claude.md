# Project
Project: finance-tracker— a personal finance app that ingests bank/credit card PDF statements, categorizes transactions with an LLM, and stores everything in Supabase. Want to create a visually engaging UI

Architecture:

- pipeline/pdf_parser.py — parses PDFs into a DataFrame, auto-detects account type and last-four digits
- pipeline/categorizer.py — LLM-based transaction categorizer with a merchant cache in Supabase
database/connector.py — uploads parsed/categorized data to Supabase (accounts, statements, transactions tables)
- main.py — orchestrates the 3-step pipeline (parse → categorize → upload); auto-builds account_name as "Chase Sapphire ****1333" from parsed card name + last four
- api.py — FastAPI wrapper so the frontend can POST a PDF and trigger the pipeline
