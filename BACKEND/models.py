from sqlalchemy import Column, Integer, String, ForeignKey
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)  
    role = Column(String)      # 'FACULTY' ya 'DRIVER'
    status = Column(String, default="AVAILABLE") # For drivers: 'AVAILABLE' or 'BUSY'
    # 🔥 WALLET CORNER: Faculty ke liye default 100 Eco-Points matrix
    wallet_balance = Column(Integer, default=100) 

class CampusNode(Base):
    __tablename__ = "campus_nodes"

    id = Column(Integer, primary_key=True, index=True)
    building_name = Column(String, unique=True, index=True)

class Ride(Base):
    __tablename__ = "rides"

    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(String, index=True) # Comma-separated faculty IDs ("1,2")
    driver_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    source_node_id = Column(Integer, ForeignKey("campus_nodes.id"))
    destination_node_id = Column(Integer, ForeignKey("campus_nodes.id"))
    status = Column(String, default="PENDING") # 'PENDING', 'ACCEPTED', 'COMPLETED', 'DECLINED'
    # 🔥 WALLET FARE MATRIX: Store fare parameters per ride
    fare_points = Column(Integer, default=20)