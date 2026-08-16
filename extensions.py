"""Shared Flask extensions — avoids circular imports.

Import these everywhere instead of creating new instances:
    from extensions import db, login_manager
"""
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()
