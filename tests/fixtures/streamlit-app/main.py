import json
import streamlit as st
import openai
from helpers import format_answer

client = openai.OpenAI()
st.title("Ask")
if prompt := st.chat_input():
    st.write(format_answer(client, prompt))
