from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1. SQLite database file ka path (hamare backend folder me campus.db naam ki file banegi)
SQLALCHEMY_DATABASE_URL = "sqlite:///./campus.db"

# 2. Database Engine create karna
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# 3. Database Session banana (jisse hum data insert/fetch karenge)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Base class jise inherit karke hum saare tables/models banayenge
Base = declarative_base()

# Dependency: Jab bhi koi API database use karegi, ye function session open aur close karega
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()